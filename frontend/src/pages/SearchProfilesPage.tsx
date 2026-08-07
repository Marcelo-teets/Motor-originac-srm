import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, DataStatusBanner, EmptyState, ErrorState, LoadingState, PageIntro, Pill } from '../components/UI';
import { defaultSearchProfileDraft, searchProfilePresets } from '../mocks/data';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { SearchProfileCandidate, SearchProfileDraft } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

type Feedback = { tone: 'success' | 'error' | 'warning'; message: string } | null;
type WorkspaceTab = 'builder' | 'saved' | 'results';
type RunSummary = { found: number; inserted: number };

type AdvancedField = {
  key: keyof SearchProfileDraft;
  label: string;
  helper: string;
  options: string[];
};

const advancedFields: AdvancedField[] = [
  { key: 'segment', label: 'Segmento', helper: 'Vertical principal da companhia.', options: searchProfilePresets.segments },
  { key: 'subsegment', label: 'Subsetor', helper: 'Recorte operacional mais específico.', options: searchProfilePresets.subsegments },
  { key: 'companyType', label: 'Tipo de empresa', helper: 'Modelo ou estágio da companhia.', options: searchProfilePresets.companyTypes },
  { key: 'geography', label: 'Geografia', helper: 'Escopo geográfico do perfil.', options: searchProfilePresets.geographies },
  { key: 'creditProduct', label: 'Produto de crédito', helper: 'Produto ou necessidade financeira observada.', options: searchProfilePresets.creditProducts },
  { key: 'receivables', label: 'Recebíveis', helper: 'Fluxo potencialmente estruturável.', options: searchProfilePresets.receivables },
  { key: 'targetStructure', label: 'Estrutura alvo', helper: 'Estrutura que orienta a tese.', options: searchProfilePresets.targetStructures },
  { key: 'signalIntensity', label: 'Intensidade mínima', helper: 'Força mínima do sinal.', options: searchProfilePresets.signalIntensity },
  { key: 'minimumConfidence', label: 'Confiança mínima', helper: 'Confiança desejada para evidências.', options: searchProfilePresets.minimumConfidence },
  { key: 'timeWindow', label: 'Janela temporal', helper: 'Período observado na descoberta.', options: searchProfilePresets.timeWindows },
];

const intensityToNumber = (value: string) => {
  if (value === 'Alta') return 75;
  if (value === 'Baixa') return 45;
  return 60;
};

export function SearchProfilesPage() {
  const { session } = useAuth();
  const [draft, setDraft] = useState<SearchProfileDraft>(defaultSearchProfileDraft);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('builder');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [runningProfileId, setRunningProfileId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SearchProfileCandidate[]>([]);
  const [runSummary, setRunSummary] = useState<RunSummary>({ found: 0, inserted: 0 });
  const { data, loading, error, setData, reload } = useAsyncData(() => api.getSearchProfiles(session), [session?.access_token]);

  const summary = useMemo(() => ([
    { label: 'Universo', value: `${draft.segment} · ${draft.subsegment}` },
    { label: 'Empresa', value: `${draft.companyType} · ${draft.geography}` },
    { label: 'Tese', value: `${draft.creditProduct} · ${draft.receivables}` },
    { label: 'Estrutura', value: draft.targetStructure },
    { label: 'Qualidade', value: `${draft.signalIntensity} · ${draft.minimumConfidence}` },
    { label: 'Janela', value: draft.timeWindow },
  ]), [draft]);

  const selectedProfile = data?.data.find((profile) => profile.id === selectedProfileId);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await api.saveSearchProfile(session, {
        id: crypto.randomUUID(),
        name: `${draft.segment} · ${draft.targetStructure}`,
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
        profilePayload: { createdFromUi: true, mode: 'advanced' },
      });
      const refreshed = await api.getSearchProfiles(session);
      setData(refreshed);
      setSelectedProfileId(saved.id);
      setFeedback({ tone: 'success', message: `Perfil salvo no Supabase: ${saved.name}.` });
      setWorkspaceTab('saved');
    } catch (saveError) {
      setFeedback({ tone: 'error', message: saveError instanceof Error ? saveError.message : 'Falha ao salvar perfil.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (profileId = selectedProfileId) => {
    if (!profileId) {
      setFeedback({ tone: 'warning', message: 'Selecione um perfil salvo para executar a busca.' });
      return;
    }
    if (runningProfileId) return;
    setSelectedProfileId(profileId);
    setRunningProfileId(profileId);
    setFeedback(null);
    try {
      const result = await api.runSearchProfile(session, profileId);
      const run = result.run as unknown as { runStatus?: string; notes?: string; candidatesFound?: number; candidatesInserted?: number };
      if (run.runStatus === 'failed') throw new Error(run.notes || 'A captura falhou antes de concluir a busca.');
      const found = Number(run.candidatesFound ?? result.candidates.length);
      const inserted = Number(run.candidatesInserted ?? result.candidates.length);
      setCandidates(result.candidates);
      setRunSummary({ found, inserted });
      setFeedback({
        tone: inserted > 0 ? 'success' : 'warning',
        message: found > 0
          ? `${found} correspondência(s) encontradas; ${inserted} nova(s) adicionada(s).`
          : 'Busca concluída sem correspondências relevantes.',
      });
      setWorkspaceTab('results');
    } catch (runError) {
      setFeedback({ tone: 'error', message: runError instanceof Error ? runError.message : 'Falha ao rodar busca.' });
    } finally {
      setRunningProfileId(null);
    }
  };

  if (loading) return <LoadingState title="Busca avançada" subtitle="Carregando perfis persistidos." />;
  if (error || !data) return <ErrorState title="Busca avançada" error={error} action={<button type="button" onClick={reload}>Tentar novamente</button>} />;

  return (
    <div className="page search-profile-workspace">
      <PageIntro
        eyebrow="Configuração avançada"
        title="Busca avançada"
        description="Use esta área apenas quando precisar controlar manualmente universo, tese e critérios técnicos. Para o uso diário, prefira a pesquisa simples."
        actions={<Link className="button secondary" to="/search-profiles">Voltar à busca simples</Link>}
      />

      <DataStatusBanner source={data.source} note={data.note} />

      <nav className="workspace-tabs" aria-label="Áreas da busca avançada">
        <button type="button" aria-pressed={workspaceTab === 'builder'} className={workspaceTab === 'builder' ? 'active' : ''} onClick={() => setWorkspaceTab('builder')}>
          <span>1</span><strong>Configurar</strong><small>Critérios completos</small>
        </button>
        <button type="button" aria-pressed={workspaceTab === 'saved'} className={workspaceTab === 'saved' ? 'active' : ''} onClick={() => setWorkspaceTab('saved')}>
          <span>2</span><strong>Perfis salvos</strong><small>{data.data.length} perfil(is)</small>
        </button>
        <button type="button" aria-pressed={workspaceTab === 'results'} className={workspaceTab === 'results' ? 'active' : ''} onClick={() => setWorkspaceTab('results')}>
          <span>3</span><strong>Resultados</strong><small>{runSummary.found} encontrada(s)</small>
        </button>
      </nav>

      {feedback ? (
        <div className={`inline-notice inline-notice-${feedback.tone === 'error' ? 'error' : feedback.tone === 'success' ? 'success' : ''}`} role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
          <Pill tone={feedback.tone === 'error' ? 'danger' : feedback.tone}>{feedback.tone === 'error' ? 'erro' : feedback.tone === 'success' ? 'concluído' : 'atenção'}</Pill>
          <span>{feedback.message}</span>
        </div>
      ) : null}

      {workspaceTab === 'builder' ? (
        <section className="profile-wizard-layout">
          <div className="profile-wizard-main">
            <Card title="Critérios do perfil" subtitle="Todos os controles ficam aqui, sem um wizard obrigatório." className="profile-wizard-card">
              <div className="profile-guidance-banner">
                <span aria-hidden="true">i</span>
                <p>Se você não precisa destes controles, volte à busca simples. O objetivo do modo avançado é exceção e precisão, não o fluxo padrão.</p>
              </div>
              <div className="profile-choice-grid">
                {advancedFields.map((field) => (
                  <label key={field.key}>
                    <span>{field.label}</span>
                    <select value={draft[field.key]} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}>
                      {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <small>{field.helper}</small>
                  </label>
                ))}
              </div>
              <div className="profile-wizard-actions">
                <Link className="button secondary" to="/search-profiles">Cancelar</Link>
                <button type="button" onClick={() => void handleSave()} disabled={saving}>{saving ? 'Salvando...' : 'Salvar perfil'}</button>
              </div>
            </Card>
          </div>

          <aside className="profile-live-preview">
            <p className="eyebrow">Resumo do perfil</p>
            <h3>{draft.segment} · {draft.targetStructure}</h3>
            <div className="profile-summary-list-v3">
              {summary.map((item) => (
                <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>
              ))}
            </div>
            <div className="profile-preview-flow" aria-label="Fontes geram candidatos para revisão humana">
              <span>Fontes</span><i aria-hidden="true">→</i><span>Captura</span><i aria-hidden="true">→</i><span>Revisão</span><i aria-hidden="true">→</i><span>Leads</span>
            </div>
          </aside>
        </section>
      ) : null}

      {workspaceTab === 'saved' ? (
        <section className="saved-profiles-workspace">
          <div className="workspace-section-heading">
            <div>
              <p className="eyebrow">Biblioteca de perfis</p>
              <h2>Escolha um perfil para executar</h2>
              <p>Perfis avançados ficam persistidos e podem ser reutilizados.</p>
            </div>
            <button type="button" className="secondary" onClick={() => setWorkspaceTab('builder')}>Criar novo perfil</button>
          </div>

          {data.data.length ? (
            <div className="saved-profile-list-v4">
              {data.data.map((profile) => {
                const selected = selectedProfileId === profile.id;
                const running = runningProfileId === profile.id;
                return (
                  <article key={profile.id} className={selected ? 'selected' : ''}>
                    <button type="button" aria-pressed={selected} className="saved-profile-select" onClick={() => setSelectedProfileId(profile.id)}>
                      <span className="saved-profile-radio" aria-hidden="true" />
                      <span><strong>{profile.name}</strong><small>{profile.segment} · {profile.subsegment} · {profile.geography}</small></span>
                    </button>
                    <div className="saved-profile-details">
                      <div><span>Estrutura</span><strong>{profile.targetStructure || 'A definir'}</strong></div>
                      <div><span>Recebíveis</span><strong>{profile.receivables.join(', ') || 'Não definidos'}</strong></div>
                      <div><span>Confiança</span><strong>{Math.round(profile.minimumConfidence * 100)}%</strong></div>
                    </div>
                    <div className="saved-profile-actions">
                      <Pill tone={profile.status === 'active' ? 'success' : 'warning'}>{profile.status}</Pill>
                      <button type="button" disabled={runningProfileId !== null} onClick={() => void handleRun(profile.id)}>{running ? 'Executando...' : 'Executar busca'}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Nenhum perfil salvo" description="Crie um perfil avançado ou use a busca simples." action={<button type="button" onClick={() => setWorkspaceTab('builder')}>Criar perfil</button>} />
          )}
        </section>
      ) : null}

      {workspaceTab === 'results' ? (
        <section className="candidate-review-workspace">
          <div className="workspace-section-heading">
            <div>
              <p className="eyebrow">Resultado</p>
              <h2>{selectedProfile ? selectedProfile.name : 'Busca avançada'}</h2>
              <p>{runSummary.found} encontrada(s) · {runSummary.inserted} nova(s). A promoção permanece na fila de revisão humana.</p>
            </div>
            <div className="pill-row">
              <Link className="button secondary" to="/capture-inbox">Abrir revisão</Link>
              <button type="button" className="secondary" onClick={() => setWorkspaceTab('saved')}>Executar outro perfil</button>
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
                    <div><strong>{candidate.companyName}</strong><span>{candidate.segment} · {candidate.website ?? 'sem site'}</span></div>
                    <p>{candidate.evidenceSummary || 'Evidência ainda não consolidada.'}</p>
                    <small>Fonte: {candidate.sourceRef}</small>
                  </div>
                  <div className="candidate-review-status">
                    <Pill tone="warning">revisar</Pill>
                    <Link className="button secondary" to="/capture-inbox">Revisar candidata</Link>
                  </div>
                </article>
              ))}
            </div>
          ) : runSummary.found > 0 ? (
            <EmptyState title="Nenhuma candidata nova" description={`${runSummary.found} correspondência(s) já estavam mapeadas. Abra a fila existente para continuar a revisão.`} action={<Link className="button" to="/capture-inbox">Ver fila existente</Link>} />
          ) : (
            <EmptyState title="Nenhuma correspondência" description="Este perfil não encontrou correspondências relevantes nesta execução." action={<button type="button" onClick={() => setWorkspaceTab('saved')}>Voltar aos perfis</button>} />
          )}
        </section>
      ) : null}
    </div>
  );
}
