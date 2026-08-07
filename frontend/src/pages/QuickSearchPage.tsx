import type { CSSProperties } from 'react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataStatusBanner, EmptyState, PageIntro, Pill } from '../components/UI';
import { defaultSearchProfileDraft, searchProfilePresets } from '../mocks/data';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { SearchProfileCandidate, SearchProfileDraft } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

type Feedback = { tone: 'success' | 'error' | 'warning'; message: string } | null;
type RunSummary = { found: number; inserted: number; existing: number; sources: number };

type SearchIntent = {
  id: string;
  label: string;
  description: string;
  example: string;
  patch: Partial<SearchProfileDraft>;
};

const intents: SearchIntent[] = [
  {
    id: 'fidc-receivables',
    label: 'Recebíveis para FIDC',
    description: 'Empresas com carteira ou fluxo recorrente potencialmente estruturável.',
    example: 'Empresas com recebíveis que podem ter fit para FIDC',
    patch: {
      segment: 'Fintech',
      subsegment: 'Antecipação de recebíveis',
      companyType: 'Originadora',
      creditProduct: 'Antecipação',
      receivables: 'Duplicatas',
      targetStructure: 'FIDC',
      timeWindow: '90 dias',
    },
  },
  {
    id: 'funding-pressure',
    label: 'Funding ficando curto',
    description: 'Empresas crescendo com sinais de pressão de capital ou funding insuficiente.',
    example: 'Fintechs crescendo e precisando de funding escalável',
    patch: {
      segment: 'Fintech',
      subsegment: 'Crédito PME',
      companyType: 'Lender',
      creditProduct: 'Crédito PME',
      receivables: 'Duplicatas',
      targetStructure: 'Warehouse',
      timeWindow: '30 dias',
    },
  },
  {
    id: 'dcm-ready',
    label: 'Prontas para DCM',
    description: 'Empresas com maturidade e sinais para dívida corporativa ou mercado de capitais.',
    example: 'Empresas com sinais de prontidão para DCM',
    patch: {
      segment: 'Fintech',
      subsegment: 'Crédito PME',
      companyType: 'Plataforma',
      creditProduct: 'Crédito PME',
      receivables: 'Duplicatas',
      targetStructure: 'Debênture',
      timeWindow: '90 dias',
    },
  },
  {
    id: 'embedded-finance',
    label: 'Embedded finance',
    description: 'Plataformas que financiam clientes, sellers ou parceiros e podem pressionar balanço.',
    example: 'Embedded finance com pressão de capital e necessidade de funding',
    patch: {
      segment: 'Embedded Finance',
      subsegment: 'Crédito PME',
      companyType: 'Plataforma',
      creditProduct: 'Crédito PME',
      receivables: 'Cartão',
      targetStructure: 'FIDC',
      timeWindow: '30 dias',
    },
  },
];

const createQuickSearchBaseDraft = (): SearchProfileDraft => ({
  ...defaultSearchProfileDraft,
  segment: 'Fintech',
  subsegment: 'Crédito PME',
  companyType: 'Plataforma',
  creditProduct: 'Crédito PME',
  receivables: 'Duplicatas',
  targetStructure: 'FIDC',
  signalIntensity: 'Alta',
  minimumConfidence: '0.70',
  timeWindow: '90 dias',
});

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const interpretQuery = (query: string, current: SearchProfileDraft): SearchProfileDraft => {
  const text = normalize(query);
  const next = { ...current };

  if (text.includes('embedded')) next.segment = 'Embedded Finance';
  else if (text.includes('health') || text.includes('saude') || text.includes('medic')) next.segment = 'Healthtech';
  else if (text.includes('logistic')) next.segment = 'Logística';
  else if (text.includes('agro')) next.segment = 'Agro';
  else if (text.includes('fintech')) next.segment = 'Fintech';

  if (text.includes('consign')) {
    next.subsegment = 'Crédito consignado';
    next.creditProduct = 'Consignado';
    next.receivables = 'Folha';
  } else if (text.includes('parcelamento') || text.includes('bnpl')) {
    next.subsegment = 'Parcelamento médico';
    next.creditProduct = 'Parcelamento';
    next.receivables = 'Parcelas médicas';
  } else if (text.includes('antecip') || text.includes('recebive')) {
    next.subsegment = 'Antecipação de recebíveis';
    next.creditProduct = 'Antecipação';
    next.receivables = text.includes('cartao') ? 'Cartão' : 'Duplicatas';
  } else if (text.includes('pme') || text.includes('smb')) {
    next.subsegment = 'Crédito PME';
    next.creditProduct = 'Crédito PME';
  }

  if (text.includes('cartao')) next.receivables = 'Cartão';
  if (text.includes('duplicata')) next.receivables = 'Duplicatas';
  if (text.includes('folha')) next.receivables = 'Folha';

  if (text.includes('warehouse')) next.targetStructure = 'Warehouse';
  else if (text.includes('nota comercial')) next.targetStructure = 'Nota comercial';
  else if (text.includes('debent') || text.includes('dcm')) next.targetStructure = 'Debênture';
  else if (text.includes('fidc')) next.targetStructure = 'FIDC';

  if (text.includes('agora') || text.includes('recente') || text.includes('timing')) next.timeWindow = '30 dias';

  return next;
};

const intensityToNumber = (value: string) => {
  if (value === 'Alta') return 75;
  if (value === 'Baixa') return 45;
  return 60;
};

const profilePayload = (id: string, draft: SearchProfileDraft, query: string) => ({
  id,
  name: `Busca rápida · ${query.trim().slice(0, 72) || `${draft.segment} · ${draft.targetStructure}`}`,
  segment: draft.segment,
  subsegment: draft.subsegment,
  companyType: draft.companyType,
  geography: draft.geography,
  creditProduct: draft.creditProduct,
  receivables: draft.receivables.split(',').map((item) => item.trim()).filter(Boolean),
  targetStructure: draft.targetStructure,
  minimumSignalIntensity: intensityToNumber(draft.signalIntensity),
  minimumConfidence: Number(draft.minimumConfidence.replace(',', '.').replace(/[^0-9.]/g, '') || 0.7),
  timeWindowDays: Number(draft.timeWindow.replace(/\D/g, '') || 90),
  profilePayload: {
    createdFromUi: true,
    mode: 'quick-search',
    userQuery: query.trim(),
  },
});

const resultBadge = (candidate: SearchProfileCandidate) => {
  if (candidate.candidateStatus === 'promoted' || candidate.status === 'promoted') {
    return { label: 'lead', tone: 'success' as const };
  }
  if (candidate.matchState === 'company_master') {
    return { label: 'Company Master', tone: 'success' as const };
  }
  if (candidate.isNewCandidate || candidate.matchState === 'new') {
    return { label: 'nova', tone: 'success' as const };
  }
  return { label: 'já mapeada', tone: 'warning' as const };
};

export function QuickSearchPage() {
  const { session } = useAuth();
  const activeProfileIdRef = useRef(crypto.randomUUID());
  const [query, setQuery] = useState('');
  const [intentPatch, setIntentPatch] = useState<Partial<SearchProfileDraft>>({});
  const [manualOverrides, setManualOverrides] = useState<Partial<SearchProfileDraft>>({});
  const [running, setRunning] = useState(false);
  const [searchPhase, setSearchPhase] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [candidates, setCandidates] = useState<SearchProfileCandidate[]>([]);
  const [lastProfileId, setLastProfileId] = useState('');
  const [lastProfileName, setLastProfileName] = useState('');
  const [lastRunSummary, setLastRunSummary] = useState<RunSummary>({ found: 0, inserted: 0, existing: 0, sources: 0 });
  const profileStatus = useAsyncData(() => api.getSearchProfiles(session), [session?.access_token]);

  const interpretedDraft = useMemo(
    () => interpretQuery(query, createQuickSearchBaseDraft()),
    [query],
  );
  const effectiveDraft = useMemo(
    () => ({ ...interpretedDraft, ...intentPatch, ...manualOverrides }),
    [interpretedDraft, intentPatch, manualOverrides],
  );

  const changeQuery = (value: string) => {
    setQuery(value);
    setIntentPatch({});
    setManualOverrides({});
  };

  const applyIntent = (intent: SearchIntent) => {
    setQuery(intent.example);
    setIntentPatch(intent.patch);
    setManualOverrides({});
    setFeedback(null);
  };

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    setSearchPhase('Preparando busca...');
    setFeedback(null);
    try {
      const payload = profilePayload(activeProfileIdRef.current, effectiveDraft, query);
      const saved = await api.saveSearchProfile(session, payload);
      setSearchPhase('Consultando catálogo, web e universo observado...');
      const result = await api.runSearchProfile(session, saved.id);
      setSearchPhase('Consolidando evidências e removendo duplicatas...');
      const runState = result.run as unknown as {
        runStatus?: string;
        notes?: string;
        sourceCount?: number;
        candidatesFound?: number;
        candidatesInserted?: number;
      };
      if (runState.runStatus === 'failed') {
        throw new Error(runState.notes || 'A busca falhou antes de concluir a captura nas fontes.');
      }

      const found = Number(runState.candidatesFound ?? result.candidates.length);
      const inserted = Number(runState.candidatesInserted ?? 0);
      const existing = Math.max(0, found - inserted);
      const sources = Number(runState.sourceCount ?? 0);
      setCandidates(result.candidates);
      setLastProfileId(saved.id);
      setLastProfileName(saved.name);
      setLastRunSummary({ found, inserted, existing, sources });

      if (found === 0) {
        setFeedback({ tone: 'warning', message: `A busca consultou ${sources || 'as'} fontes/lentes disponíveis, mas não encontrou correspondências. Tente uma descrição mais ampla.` });
      } else {
        setFeedback({
          tone: 'success',
          message: `${found} correspondência(s): ${inserted} nova(s) e ${existing} já mapeada(s), consolidadas a partir de ${sources || 1} fonte(s)/lente(s).`,
        });
      }
    } catch (runError) {
      setFeedback({ tone: 'error', message: runError instanceof Error ? runError.message : 'Falha ao executar a busca.' });
    } finally {
      setSearchPhase('');
      setRunning(false);
    }
  };

  const resetSearch = () => {
    activeProfileIdRef.current = crypto.randomUUID();
    setCandidates([]);
    setLastProfileId('');
    setLastProfileName('');
    setLastRunSummary({ found: 0, inserted: 0, existing: 0, sources: 0 });
    setFeedback(null);
  };

  return (
    <div className="page simple-page quick-search-page">
      <PageIntro
        eyebrow="Descoberta de oportunidades"
        title="O que você quer encontrar?"
        description="Descreva a tese em linguagem normal. O motor consulta o catálogo real de fontes, reaproveita o universo já observado e abre novas buscas em paralelo antes de consolidar as empresas mais relevantes."
        actions={<Link className="button secondary" to="/search-profiles/advanced">Busca avançada</Link>}
      />

      {profileStatus.data ? <DataStatusBanner source={profileStatus.data.source} note={profileStatus.data.note} /> : null}
      {profileStatus.error ? (
        <div className="inline-notice" role="status">
          <Pill tone="warning">parcial</Pill>
          <span>O catálogo de buscas anteriores não respondeu, mas a busca nova continua disponível.</span>
        </div>
      ) : null}

      <section className="quick-search-shell" aria-label="Busca simples de empresas">
        <div className="quick-search-main">
          <label className="quick-search-input">
            <span>Descreva em linguagem normal</span>
            <textarea
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              placeholder="Ex.: fintechs de consignado que estão crescendo e podem precisar de FIDC"
              rows={3}
              autoFocus
            />
          </label>

          <div className="quick-search-intents" aria-label="Atalhos de busca">
            {intents.map((intent) => (
              <button key={intent.id} type="button" onClick={() => applyIntent(intent)}>
                <strong>{intent.label}</strong>
                <small>{intent.description}</small>
              </button>
            ))}
          </div>

          <details className="quick-search-adjustments">
            <summary>Ajustar critérios, se necessário</summary>
            <div>
              <label>
                <span>Segmento</span>
                <select value={effectiveDraft.segment} onChange={(event) => setManualOverrides((current) => ({ ...current, segment: event.target.value }))}>
                  {searchProfilePresets.segments.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Estrutura provável</span>
                <select value={effectiveDraft.targetStructure} onChange={(event) => setManualOverrides((current) => ({ ...current, targetStructure: event.target.value }))}>
                  {searchProfilePresets.targetStructures.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Janela</span>
                <select value={effectiveDraft.timeWindow} onChange={(event) => setManualOverrides((current) => ({ ...current, timeWindow: event.target.value }))}>
                  {searchProfilePresets.timeWindows.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>
          </details>

          <div className="quick-search-actions">
            <div>
              <span>{running ? searchPhase : 'Descobrir amplo, qualificar depois'}</span>
              <small>{running ? 'As consultas rodam em paralelo e a base existente entra como universo de descoberta.' : 'Catálogo real + mídia nichada + portfólios + universo persistido · dedupe · revisão humana antes de virar Lead.'}</small>
            </div>
            <button type="button" onClick={() => void handleRun()} disabled={running}>
              {running ? searchPhase || 'Buscando empresas...' : 'Buscar empresas'}
            </button>
          </div>
        </div>

        <aside className="quick-search-interpretation">
          <p className="eyebrow">O motor entendeu</p>
          <h2>{effectiveDraft.segment}</h2>
          <dl>
            <div><dt>Tese</dt><dd>{effectiveDraft.creditProduct}</dd></div>
            <div><dt>Recebíveis</dt><dd>{effectiveDraft.receivables}</dd></div>
            <div><dt>Estrutura</dt><dd>{effectiveDraft.targetStructure}</dd></div>
            <div><dt>Janela</dt><dd>{effectiveDraft.timeWindow}</dd></div>
          </dl>
          <p>A descoberta busca primeiro o universo: fontes nichadas e institucionais, web, portfólios e empresas já observadas. Score e qualificação financeira entram depois para ordenar, não para esconder empresas cedo demais.</p>
        </aside>
      </section>

      {feedback ? (
        <div className={`inline-notice inline-notice-${feedback.tone === 'error' ? 'error' : feedback.tone === 'success' ? 'success' : ''}`} role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
          <Pill tone={feedback.tone === 'error' ? 'danger' : feedback.tone}>{feedback.tone === 'error' ? 'erro' : feedback.tone === 'success' ? 'concluído' : 'atenção'}</Pill>
          <span>{feedback.message}</span>
        </div>
      ) : null}

      {lastProfileId ? (
        <section className="quick-search-results">
          <div className="workspace-section-heading">
            <div>
              <p className="eyebrow">Resultado da busca</p>
              <h2>{lastProfileName}</h2>
              <p>{lastRunSummary.found} encontrada(s) · {lastRunSummary.inserted} nova(s) · {lastRunSummary.existing} já mapeada(s) · {lastRunSummary.sources} fonte(s)/lente(s) respondendo. A revisão humana continua obrigatória antes de promover para Leads.</p>
            </div>
            <div className="pill-row">
              <Link className="button secondary" to="/capture-inbox">Abrir revisão</Link>
              <button type="button" className="secondary" onClick={resetSearch}>Nova busca</button>
            </div>
          </div>

          {candidates.length ? (
            <div className="candidate-review-list">
              {candidates.slice(0, 60).map((candidate) => {
                const badge = resultBadge(candidate);
                const sourceRef = candidate.currentSearchSourceRef ?? candidate.sourceRef;
                const evidence = candidate.currentSearchEvidenceSummary ?? candidate.evidenceSummary;
                return (
                  <article key={candidate.id}>
                    <div className="candidate-confidence-ring" role="img" aria-label={`Confiança de ${Math.round(candidate.confidence * 100)}%`} style={{ '--confidence': `${Math.round(candidate.confidence * 100)}%` } as CSSProperties}>
                      <strong>{Math.round(candidate.confidence * 100)}%</strong>
                    </div>
                    <div className="candidate-review-main">
                      <div>
                        <strong>{candidate.companyName}</strong>
                        <span>{candidate.segment} · {candidate.website ?? 'sem site'}</span>
                      </div>
                      <p>{evidence || 'Evidência ainda não consolidada.'}</p>
                      <small>Fonte da correspondência: {sourceRef}</small>
                    </div>
                    <div className="candidate-review-status">
                      <Pill tone={badge.tone}>{badge.label}</Pill>
                      {candidate.matchState === 'company_master' && candidate.companyId ? (
                        <Link className="button secondary" to={`/companies/${candidate.companyId}`}>Abrir empresa</Link>
                      ) : (
                        <Link className="button secondary" to="/capture-inbox">Revisar candidata</Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Nenhuma correspondência encontrada"
              description="A busca foi concluída sem correspondências relevantes. Tente uma descrição mais ampla ou use um dos atalhos acima."
              action={<button type="button" onClick={resetSearch}>Refinar busca</button>}
            />
          )}

          {candidates.length > 60 ? (
            <div className="inline-notice" role="status">
              <Pill tone="warning">amostra</Pill>
              <span>Mostrando as 60 correspondências mais relevantes de {candidates.length}. A fila completa permanece disponível para revisão.</span>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
