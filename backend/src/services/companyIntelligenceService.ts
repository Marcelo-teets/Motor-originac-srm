import { getSupabaseClient } from '../lib/supabase.js';

type IntelligenceSummary = {
  companyId: string;
  rawDocumentCount: number;
  factCount: number;
  signalCount: number;
  enrichmentSnapshotCount: number;
  topSignalTypes: string[];
  topFactKeys: string[];
  inferredFlags: {
    hasCreditProductEvidence: boolean;
    hasReceivablesEvidence: boolean;
    hasFundingSignal: boolean;
    hasFidcEvidence: boolean;
    fitForStructuredCredit: boolean;
  };
  intelligenceConfidence: number;
  recommendedNextStep: string;
};

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export class CompanyIntelligenceService {
  private readonly client = getSupabaseClient();

  async getCompanySummary(companyId: string): Promise<IntelligenceSummary> {
    if (!this.client) {
      return {
        companyId,
        rawDocumentCount: 0,
        factCount: 0,
        signalCount: 0,
        enrichmentSnapshotCount: 0,
        topSignalTypes: [],
        topFactKeys: [],
        inferredFlags: {
          hasCreditProductEvidence: false,
          hasReceivablesEvidence: false,
          hasFundingSignal: false,
          hasFidcEvidence: false,
          fitForStructuredCredit: false,
        },
        intelligenceConfidence: 0,
        recommendedNextStep: 'Seedar catálogo e executar conectores da companhia.',
      };
    }

    const [links, facts, signals, snapshots] = await Promise.all([
      this.client.select('company_source_links', { select: '*', filters: [{ column: 'company_id', operator: 'eq', value: companyId }] }).catch(() => []),
      this.client.select('company_source_facts', { select: '*', filters: [{ column: 'company_id', operator: 'eq', value: companyId }] }).catch(() => []),
      this.client.select('signal_extractions', { select: '*', filters: [{ column: 'company_id', operator: 'eq', value: companyId }] }).catch(() => []),
      this.client.select('enrichment_snapshots', { select: '*', filters: [{ column: 'company_id', operator: 'eq', value: companyId }] }).catch(() => []),
    ]);

    const safeLinks = Array.isArray(links) ? links : [];
    const safeFacts = Array.isArray(facts) ? facts : [];
    const safeSignals = Array.isArray(signals) ? signals : [];
    const safeSnapshots = Array.isArray(snapshots) ? snapshots : [];

    const topSignalTypes = [...new Set(safeSignals.map((item: any) => String(item.signal_type)))].slice(0, 5);
    const topFactKeys = [...new Set(safeFacts.map((item: any) => String(item.fact_key)))].slice(0, 5);

    const hasCreditProductEvidence = safeFacts.some((item: any) => String(item.fact_type) === 'credit_product')
      || safeSignals.some((item: any) => String(item.signal_type).includes('embedded_finance') || String(item.signal_type).includes('credit'));
    const hasReceivablesEvidence = safeFacts.some((item: any) => String(item.fact_type) === 'receivables')
      || safeSignals.some((item: any) => String(item.signal_type).includes('receivables'));
    const hasFundingSignal = safeFacts.some((item: any) => String(item.fact_type) === 'funding')
      || safeSignals.some((item: any) => String(item.signal_type).includes('funding') || String(item.signal_type).includes('capital'));
    const hasFidcEvidence = safeFacts.some((item: any) => String(item.fact_key).includes('fidc'))
      || safeSignals.some((item: any) => String(item.signal_type).includes('fidc'));

    const signalConfidences = safeSignals.map((item: any) => Number(item.confidence ?? 0));
    const factConfidences = safeFacts.map((item: any) => Number(item.confidence ?? 0));
    const snapshotConfidences = safeSnapshots.map((item: any) => Number(item.confidence ?? 0));
    const intelligenceConfidence = Number(average([...signalConfidences, ...factConfidences, ...snapshotConfidences]).toFixed(4));

    const fitForStructuredCredit = (hasReceivablesEvidence && hasFundingSignal) || (hasCreditProductEvidence && hasFundingSignal) || hasFidcEvidence;

    const recommendedNextStep = fitForStructuredCredit
      ? 'Atualizar qualification e revisar estrutura sugerida com base nos novos sinais.'
      : safeLinks.length
        ? 'Ampliar fontes e extrair mais facts antes de priorizar comercialmente.'
        : 'Executar bootstrap de conectores e vincular documentos à companhia.';

    return {
      companyId,
      rawDocumentCount: safeLinks.length,
      factCount: safeFacts.length,
      signalCount: safeSignals.length,
      enrichmentSnapshotCount: safeSnapshots.length,
      topSignalTypes,
      topFactKeys,
      inferredFlags: {
        hasCreditProductEvidence,
        hasReceivablesEvidence,
        hasFundingSignal,
        hasFidcEvidence,
        fitForStructuredCredit,
      },
      intelligenceConfidence,
      recommendedNextStep,
    };
  }

  async listCompanyFacts(companyId: string) {
    if (!this.client) return [];
    return this.client.select('company_source_facts', {
      select: '*',
      orderBy: { column: 'created_at', ascending: false },
      filters: [{ column: 'company_id', operator: 'eq', value: companyId }],
      limit: 100,
    }).catch(() => []);
  }

  async listCompanySignals(companyId: string) {
    if (!this.client) return [];
    return this.client.select('signal_extractions', {
      select: '*',
      orderBy: { column: 'created_at', ascending: false },
      filters: [{ column: 'company_id', operator: 'eq', value: companyId }],
      limit: 100,
    }).catch(() => []);
  }

  async listCompanyEnrichmentSnapshots(companyId: string) {
    if (!this.client) return [];
    return this.client.select('enrichment_snapshots', {
      select: '*',
      orderBy: { column: 'created_at', ascending: false },
      filters: [{ column: 'company_id', operator: 'eq', value: companyId }],
      limit: 50,
    }).catch(() => []);
  }
}
