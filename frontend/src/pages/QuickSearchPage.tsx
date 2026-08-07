import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataStatusBanner, EmptyState, ErrorState, LoadingState, PageIntro, Pill } from '../components/UI';
import { defaultSearchProfileDraft, searchProfilePresets } from '../mocks/data';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { SearchProfileCandidate, SearchProfileDraft } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

type Feedback = { tone: 'success' | 'error' | 'warning'; message: string } | null;
type RunSummary = { found: number; inserted: number };

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

const profilePayload = (draft: SearchProfileDraft, query: string) => ({
  id: crypto.randomUUID(),
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

export function QuickSearchPage() {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<SearchProfileDraft>({
    ...defaultSearchProfileDraft,
    signalIntensity: 'Alta',
    minimumConfidence: '0.70',
    timeWindow: '90 dias',
  });
  const [manualOverrides, setManualOverrides] = useState<Partial<SearchProfileDraft>>({});
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [candidates, setCandidates] = useState<SearchProfileCandidate[]>([]);
  const [lastProfileId, setLastProfileId] = useState('');
  const [lastProfileName, setLastProfileName] = useState('');
  const [lastRunSummary, setLastRunSummary] = useState<RunSummary>({ found: 0, inserted: 0 });
  const { data, loading, error, reload } = useAsyncData(() => api.getSearchProfiles(session), [session?.access_token]);

  const interpretedDraft = useMemo(() => interpretQuery(query, draft), [query, draft]);
  const effectiveDraft = useMemo(() => ({ ...interpretedDraft, ...manualOverrides }), [interpretedDraft, manualOverrides]);

  const changeQuery = (value: string) => {
    setQuery(value);
    setManualOverrides({});
  };

  const applyIntent = (intent: SearchIntent) => {
    setQuery(intent.example);
    setDraft((current) => ({ ...current, ...intent.patch }));
    setManualOverrides({});
    setFeedback(null);
  };

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    setFeedback(null);
    try {
      const payload = profilePayload(effectiveDraft, query);
      const saved = await api.saveSearchProfile(session, payload);
      const result = await api.runSearchProfile(session, saved.id);
      const runState = result.run as unknown as {
        runStatus?: string;
        notes?: string;
        candidatesFound?: number;
        candidatesInserted?: number;
      };
      if (runState.runStatus === 'failed') {
        throw new Error(runState.notes || 'A busca falhou antes de concluir a captura nas fontes.');
      }

      const found = Number(runState.candidatesFound ?? result.candidates.length);
      const inserted = Number(runState.candidatesInserted ?? result.candidates.length);
      setCandidates(result.candidates);
      setLastProfileId(saved.id);
      setLastProfileName(saved.name);
      setLastRunSummary({ found, inserted });

      if (found === 0) {
        setFeedback({ tone: 'warning', message: 'A busca funcionou, mas não encontrou correspondências. Amplie a descrição ou tente outro atalho.' });
      } else if (inserted === 0) {
        setFeedback({ tone: 'warning', message: `A busca encontrou ${found} correspondência(s), mas nenhuma é nova. Elas já estavam mapeadas na base ou na fila de revisão.` });
      } else {
        setFeedback({ tone: 'success', message: `${found} correspondência(s) encontradas; ${inserted} nova(s) adicionada(s) para revisão.` });
      }
    } catch (runError) {
      setFeedback({ tone: 'error', message: runError instanceof Error ? runError.message : 'Falha ao executar a busca.' });
    } finally {
      setRunning(false);
    }
  };

  const resetSearch = () => {
    setCandidates([]);
    setLastProfileId('');
    setLastProfileName('');
    setLastRunSummary({ found: 0, inserted: 0 });
    setFeedback(null);
  };

  if (loading) return <LoadingState title="Pesquisar" subtitle="Preparando o motor de descoberta." />;
  if (error || !data) return <ErrorState title="Pesquisar" error={error} action={<button type="button" onClick={reload}>Tentar novamente</button>} />;

  return (
    <div className="page simple-page quick-search-page">
      <PageIntro
        eyebrow="Descoberta de oportunidades"
        title="O que você quer encontrar?"
        description="Descreva a empresa ou oportunidade que procura. O motor transforma isso em critérios de busca, consulta as fontes e devolve candidatas para revisão."
        actions={<Link className="button secondary" to="/search-profiles/advanced">Busca avançada</Link>}
      />

      <DataStatusBanner source={data.source} note={data.note} />

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
              <span>Sem configurar filtros técnicos</span>
              <small>Brasil · sinais fortes · confiança mínima de 70% · defaults do perfil aplicados automaticamente.</small>
            </div>
            <button type="button" onClick={() => void handleRun()} disabled={running}>
              {running ? 'Buscando empresas...' : 'Buscar empresas'}
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
          <p>Você pode simplesmente buscar. Os parâmetros avançados continuam disponíveis apenas quando forem realmente necessários.</p>
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
              <p>{lastRunSummary.found} encontrada(s) · {lastRunSummary.inserted} nova(s). Identidade e promoção para Leads continuam protegidas pela revisão humana.</p>
            </div>
            <div className="pill-row">
              <Link className="button secondary" to="/capture-inbox">Abrir revisão</Link>
              <button type="button" className="secondary" onClick={resetSearch}>Nova busca</button>
            </div>
          </div>

          {candidates.length ? (
            <div className="candidate-review-list">
              {candidates.map((candidate) => (
                <article key={candidate.id}>
                  <div className="candidate-confidence-ring" role="img" aria-label={`Confiança de ${Math.round(candidate.confidence * 100)}%`} style={{ '--confidence': `${Math.round(candidate.confidence * 100)}%` } as CSSProperties}>
                    <strong>{Math.round(candidate.confidence * 100)}%</strong>
                  </div>
                  <div className="candidate-review-main">
                    <div>
                      <strong>{candidate.companyName}</strong>
                      <span>{candidate.segment} · {candidate.website ?? 'sem site'}</span>
                    </div>
                    <p>{candidate.evidenceSummary || 'Evidência ainda não consolidada.'}</p>
                    <small>Fonte: {candidate.sourceRef}</small>
                  </div>
                  <div className="candidate-review-status">
                    <Pill tone={candidate.status === 'promoted' ? 'success' : 'warning'}>{candidate.status === 'promoted' ? 'lead' : 'revisar'}</Pill>
                    <Link className="button secondary" to="/capture-inbox">Revisar candidata</Link>
                  </div>
                </article>
              ))}
            </div>
          ) : lastRunSummary.found > 0 ? (
            <EmptyState
              title="Nenhuma candidata nova"
              description={`${lastRunSummary.found} correspondência(s) foram localizadas, mas já estavam mapeadas. Abra a revisão para trabalhar a fila existente ou refine a busca para encontrar novas empresas.`}
              action={<Link className="button" to="/capture-inbox">Ver fila existente</Link>}
            />
          ) : (
            <EmptyState
              title="Nenhuma correspondência encontrada"
              description="A busca foi concluída sem correspondências relevantes. Tente uma descrição mais ampla ou use um dos atalhos acima."
              action={<button type="button" onClick={resetSearch}>Refinar busca</button>}
            />
          )}
        </section>
      ) : null}
    </div>
  );
}
