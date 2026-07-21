import { inferSourceCode } from './connectors.js';
import { fetchOpenFinanceParticipants, OPEN_FINANCE_DIRECTORY_URL, type OpenFinanceParticipant } from './openFinanceParticipants.js';
import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../types/platform.js';

type RuntimeSource = SourceCatalogEntry & { runtimeCode: string };

type CaptureBundle = {
  outputs: MonitoringOutput[];
  signals: CompanySignal[];
  enrichments: EnrichmentRecord[];
};

const MIN_MATCH_NAME_LENGTH = 4;

const emptyBundle = (): CaptureBundle => ({ outputs: [], signals: [], enrichments: [] });

const runtimeSource = (source: SourceCatalogEntry): RuntimeSource => ({
  ...source,
  runtimeCode: inferSourceCode(source),
});

const findSource = (sources: SourceCatalogEntry[]) => sources
  .filter((source) => source.status !== 'planned')
  .map(runtimeSource)
  .find((source) => source.runtimeCode === 'src_open_finance_participants_api');

const normalize = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const onlyDigits = (value: string) => value.replace(/\D/g, '');

// O diretório é company-agnostic; uma busca por execução do engine.
let directoryCache: { key: string; promise: Promise<OpenFinanceParticipant[]> } | null = null;

const fetchDirectoryOnce = (collectedAt: string) => {
  if (directoryCache?.key !== collectedAt) {
    directoryCache = {
      key: collectedAt,
      promise: fetchOpenFinanceParticipants().catch(() => [] as OpenFinanceParticipant[]),
    };
  }
  return directoryCache.promise;
};

// Matching de precisão alta: CNPJ exato primeiro; nome só por igualdade exata
// normalizada (nunca substring) — falso positivo é pior que ausência de sinal.
const matchParticipants = (company: CompanySeed, participants: OpenFinanceParticipant[]) => {
  const companyCnpj = onlyDigits(company.cnpj ?? '');
  if (companyCnpj.length === 14) {
    const byCnpj = participants.filter((participant) => participant.cnpj === companyCnpj);
    if (byCnpj.length) return { matches: byCnpj, method: 'cnpj' as const };
  }

  const names = [company.tradeName, company.legalName]
    .map((name) => normalize(name ?? ''))
    .filter((name) => name.length >= MIN_MATCH_NAME_LENGTH);
  const byName = participants.filter((participant) =>
    names.includes(normalize(participant.name)) || names.includes(normalize(participant.registeredName)));
  return { matches: byName, method: 'exact_name' as const };
};

export async function captureOpenFinanceParticipation(company: CompanySeed, sources: SourceCatalogEntry[], collectedAt: string): Promise<CaptureBundle> {
  const source = findSource(sources);
  if (!source) return emptyBundle();

  const participants = await fetchDirectoryOnce(collectedAt);
  // Diretório indisponível ou empresa fora dele: sem evidência, nada é emitido.
  if (!participants.length) return emptyBundle();

  const { matches, method } = matchParticipants(company, participants);
  if (!matches.length) return emptyBundle();

  const confidence = method === 'cnpj' ? 0.9 : 0.72;
  const participantNames = matches.map((participant) => participant.name);
  const summary = `Participante do Open Finance Brasil (${method === 'cnpj' ? 'CNPJ confirmado' : 'nome exato'}): ${participantNames.join(', ')}`;

  return {
    outputs: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      sourceId: source.id,
      title: `Open Finance Brasil · ${company.tradeName}`,
      summary,
      collectedAt,
      confidenceScore: confidence,
      connectorStatus: 'real',
      normalizedPayload: {
        matchMethod: method,
        participants: matches.map((participant) => ({
          organisationId: participant.organisationId,
          name: participant.name,
          status: participant.status,
        })),
        sourceUrl: OPEN_FINANCE_DIRECTORY_URL,
        timestamp: collectedAt,
        confidenceScore: confidence,
        sourceCode: source.runtimeCode,
        sourceName: source.name,
        sourceCategory: source.category,
      },
    }],
    signals: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      sourceId: source.id,
      signalType: 'financial_infrastructure_signal',
      signalStrength: method === 'cnpj' ? 84 : 76,
      confidenceScore: confidence,
      evidencePayload: {
        note: summary,
        provider: 'Open Finance Brasil (diretório oficial)',
        matchMethod: method,
        participants: participantNames,
        sourceCode: source.runtimeCode,
        sourceName: source.name,
        sourceUrl: OPEN_FINANCE_DIRECTORY_URL,
        timestamp: collectedAt,
      },
      observedVsInferred: 'observed',
      createdAt: collectedAt,
    }],
    enrichments: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      enrichmentType: 'open_finance_participation',
      provider: 'Open Finance Brasil (diretório oficial)',
      payload: {
        sourceId: source.id,
        sourceCode: source.runtimeCode,
        sourceConfidence: confidence,
        matchMethod: method,
        participants: matches,
        sourceUrl: OPEN_FINANCE_DIRECTORY_URL,
        collectedAt,
      },
      observedVsInferred: 'observed',
      createdAt: collectedAt,
    }],
  };
}
