import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { Card, DataStatusBanner, EmptyState, ErrorState, LoadingState, PageIntro, Pill } from '../components/UI';
import { defaultSearchProfileDraft, searchProfilePresets } from '../mocks/data';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { SearchProfileCandidate, SearchProfileDraft } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

const profileSteps: Array<{ number: string; title: string; description: string; guidance: string; fields: Array<{ key: keyof SearchProfileDraft; label: string; helper: string; options: string[] }> }> = [
  {
    number: '01',
    title: 'Defina o universo',
    description: 'Quem deve entrar no radar.',
    guidance: 'Comece amplo o suficiente para não perder empresas relevantes, mas mantenha um recorte coerente com a tese de originação.',
    fields: [
      { key: 'segment', label: 'Segmento', helper: 'Vertical principal da empresa.', options: searchProfilePresets.segments },
      { key: 'subsegment', label: 'Subsetor', helper: 'Recorte operacional mais específico.', options: searchProfilePresets.subsegments },
      { key: 'companyType', label: 'Tipo de empresa', helper: 'Modelo societário ou estágio desejado.', options: searchProfilePresets.companyTypes },
      { key: 'geography', label: 'Geografia', helper: 'O projeto opera com foco Brasil.', options: searchProfilePresets.geographies },
    ],
  },
  {
    number: '02',
    title: 'Defina a tese financeira',
    description: 'Que necessidade queremos detectar.',
    guidance: 'A busca deve refletir uma hipótese de crédito. Escolha o produto, os recebíveis e a estrutura que justificam acompanhar essas empresas.',
    fields: [
      { key: 'creditProduct', label: 'Produto de crédito', helper: 'Indício de necessidade ou oferta de crédito.', options: searchProfilePresets.creditProducts },
      { key: 'receivables', label: 'Recebíveis', helper: 'Fluxos potencialmente estruturáveis.', options: searchProfilePresets.receivables },
      { key: 'targetStructure', label: 'Estrutura alvo', helper: 'Produto que deve orientar a qualificação.', options: searchProfilePresets.targetStructures },
    ],
  },
  {
    number: '03',
    title: 'Ajuste a qualidade',
    description: 'Controle ruído, confiança e recência.',
    guidance: 'Quanto maior a confiança e a intensidade, menor o volume e maior a precisão. Use janelas curtas para sinais de timing e janelas maiores para sinais estruturais.',
    fields: [
      { key: 'signalIntensity', label: 'Intensidade mínima', helper: 'Força mínima para considerar um sinal.', options: searchProfilePresets.signalIntensity },
      { key: 'minimumConfidence', label: 'Confidence mínima', helper: 'Qualidade mínima da evidência.', options: searchProfilePresets.minimumConfidence },
      { key: 'timeWindow', label: 'Janela temporal', helper: 'Período observado na descoberta.', options: searchProfilePresets.timeWindows },
    ],
  },
];

type Feedback = { tone: 'success' | 'error' | 'warning'; message: string } | null;

export function SearchProfilesPage() {
  const { session } = useAuth();
  const [draft, setDraft] = useState<SearchProfileDraft>(defaultSearchProfileDraft);
  const [activeStep, setActiveStep] = useState(0);
  const [workspaceTab, setWorkspaceTab] = useState<'builder' | 'saved' | 'results'>('builder');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [runningProfileId, setRunningProfileId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SearchProfileCandidate[]>([]);
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
  const currentStep = profileSteps[activeStep];

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await api.saveSearchProfile(session, {
        name: `${draft.segment} · ${draft.targetStructure}`,
        segment: draft.segment,
        subsegment: draft.subsegment,
        companyType: draft.companyType,
        geography: draft.geography,
        creditProduct: draft.creditProduct,
        receivables: draft.receivables.split(',').map((item) => item.trim()).filter(Boolean),
        targetStructure: draft.targetStructure,
        minimumSignalIntensity: Number(draft.signalIntensity.replace(/\D/g, '') || 60),
        minimumConfidence: Number(draft.minimumConfidence.replace(',', '.').replace(/[^0-9.]/g, '') || 0.7),
        timeWindowDays: Number(draft.timeWindow.replace(/\D/g, '') || 90),
        profilePayload: { createdFromUi: true },
      });
      const refreshed = await api.getSearchProfiles(session);
      setData(refreshed);
      setSelectedProfileId(saved.id);
      setFeedback({ tone: 'success', message: `Perfil salvo: ${saved.name}.` });
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
      setCandidates(result.candidates);
      setFeedback({ tone: 'success', message: `Busca concluída: ${result.candidates.length} candidato(s) capturado(s).` });
      setWorkspaceTab('results');
    } catch (runError) {
      setFeedback({ tone: 'error', message: runError instanceof Error ? runError.message : 'Falha ao rodar busca.' });
    } finally {
      setRunningProfileId(null);
    }
  };

  const handlePromote = async (candidateId: string) => {
    if (promotingId) return;
    setPromotingId(candidateId);
    setFeedback(null);
    try {
      await api.promoteSearchCandidate(session, candidateId);
      const refreshed = await api.getSearchProfileCandidates(session, selectedProfileId);
      setCandidates(refreshed);
      setFeedback({ tone: 'success', message: 'Candidato promovido para a base de leads.' });
    } catch (promoteError) {
      setFeedback({ tone: 'error', message: promoteError instanceof Error ? promoteError.message : 'Falha ao promover candidato.' });
    } finally {
      setPromotingId(null);
    }
  };

  if (loading) return <LoadingState title="Perfis de busca" subtitle="Carregando teses de descoberta persistidas." />;
  if (error || !data) return <ErrorState title="Perfis de busca" error={error} action={<button type="button" onClick={reload}>Tentar novamente</button>} />;

  return (
    <div className="page search-profile-workspace">
      <PageIntro
        eyebrow="Descoberta orientada por tese"
        title="Perfis de busca"
        description="Crie uma tese de descoberta, execute o monitoramento e promova apenas empresas que tenham evidência suficiente para entrar no funil."
        actions={<Pill tone={data.source === 'real' ? 'success' : 'warning'}>{data.source === 'real' ? 'persistência real' : 'persistência parcial'}</Pill>}
      />

      <DataStatusBanner source={data.source} note={data.note} />

      <nav className="workspace-tabs" aria-label="Etapas dos perfis de busca">
        <button type="button" aria-pressed={workspaceTab === 'builder'} className={workspaceTab === 'builder' ? 'active' : ''} onClick={() => setWorkspaceTab('builder')}>
          <span>1</span><strong>Criar perfil</strong><small>Definir universo e tese</small>
        </button>
        <button type="button" aria-pressed={workspaceTab === 'saved'} className={workspaceTab === 'saved' ? 'active' : ''} onClick={() => setWorkspaceTab('saved')}>
          <span>2</span><strong>Perfis salvos</strong><small>{data.data.length} configuração(ões)</small>
        </button>
        <button type="button" aria-pressed={workspaceTab === 'results'} className={workspaceTab === 'results' ? 'active' : ''} onClick={() => setWorkspaceTab('results')}>
          <span>3</span><strong>Revisar candidatos</strong><small>{candidates.length} resultado(s)</small>
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
            <div className="profile-stepper" aria-label="Etapas de criação">
              {profileSteps.map((step, index) => (
                <button
                  key={step.number}
                  type="button"
                  aria-current={index === activeStep ? 'step' : undefined}
                  className={index === activeStep ? 'active' : index < activeStep ? 'complete' : ''}
                  onClick={() => setActiveStep(index)}
                >
                  <span>{index < activeStep ? '✓' : step.number}</span>
                  <strong>{step.title}</strong>
                </button>
              ))}
            </div>

            <Card title={`${currentStep.number} · ${currentStep.title}`} subtitle={currentStep.description} className="profile-wizard-card">
              <div className="profile-guidance-banner">
                <span aria-hidden="true">i</span>
                <p>{currentStep.guidance}</p>
              </div>
              <div className="profile-choice-grid">
                {currentStep.fields.map((field) => (
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
                <button type="button" className="secondary" disabled={activeStep === 0 || saving} onClick={() => setActiveStep((current) => Math.max(0, current - 1))}>Voltar</button>
                {activeStep < profileSteps.length - 1 ? (
                  <button type="button" disabled={saving} onClick={() => setActiveStep((current) => Math.min(profileSteps.length - 1, current + 1))}>Continuar</button>
                ) : (
                  <button type="button" onClick={() => void handleSave()} disabled={saving}>{saving ? 'Salvando...' : 'Salvar perfil'}</button>
                )}
              </div>
            </Card>
          </div>

          <aside className="profile-live-preview">
            <p className="eyebrow">Prévia da tese</p>
            <h3>{draft.segment} · {draft.targetStructure}</h3>
            <p>Este perfil buscará empresas com os critérios abaixo e exigirá evidência mínima antes de gerar candidatos.</p>
            <div className="profile-summary-list-v3">
              {summary.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <div className="profile-preview-flow" aria-label="Fontes geram sinais, candidatos e leads">
              <span>Fontes</span><i aria-hidden="true">→</i><span>Sinais</span><i aria-hidden="true">→</i><span>Candidatos</span><i aria-hidden="true">→</i><span>Leads</span>
            </div>
          </aside>
        </section>
      ) : null}

      {workspaceTab === 'saved' ? (
        <section className="saved-profiles-workspace">
          <div className="workspace-section-heading">
            <div>
              <p className="eyebrow">Biblioteca de perfis</p>
              <h2>Escolha uma tese para executar</h2>
              <p>O perfil selecionado controla o universo, os sinais e os critérios mínimos da próxima busca.</p>
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
                      <span>
                        <strong>{profile.name}</strong>
                        <small>{profile.segment} · {profile.subsegment} · {profile.geography}</small>
                      </span>
                    </button>
                    <div className="saved-profile-details">
                      <div><span>Estrutura</span><strong>{profile.targetStructure}</strong></div>
                      <div><span>Recebíveis</span><strong>{profile.receivables.join(', ') || 'Não definidos'}</strong></div>
                      <div><span>Qualidade</span><strong>{profile.minimumSignalIntensity} · {Math.round(profile.minimumConfidence * 100)}%</strong></div>
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
            <EmptyState title="Nenhum perfil salvo" description="Crie o primeiro perfil para iniciar a descoberta estruturada de empresas." action={<button type="button" onClick={() => setWorkspaceTab('builder')}>Criar perfil</button>} />
          )}
        </section>
      ) : null}

      {workspaceTab === 'results' ? (
        <section className="candidate-review-workspace">
          <div className="workspace-section-heading">
            <div>
              <p className="eyebrow">Revisão humana</p>
              <h2>Candidatos encontrados</h2>
              <p>{selectedProfile ? `Resultados do perfil ${selectedProfile.name}.` : 'Execute um perfil salvo para carregar candidatos.'}</p>
            </div>
            <button type="button" className="secondary" onClick={() => setWorkspaceTab('saved')}>Executar outro perfil</button>
          </div>

          {candidates.length ? (
            <div className="candidate-review-list">
              {candidates.map((candidate) => {
                const promoted = candidate.status === 'promoted';
                const promoting = promotingId === candidate.id;
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
                      <p>{candidate.evidenceSummary || 'Evidência ainda não consolidada.'}</p>
                      <small>Fonte: {candidate.sourceRef}</small>
                    </div>
                    <div className="candidate-review-status">
                      <Pill tone={promoted ? 'success' : 'warning'}>{candidate.status}</Pill>
                      <button type="button" className={promoted ? 'secondary' : ''} disabled={promoted || promotingId !== null} onClick={() => void handlePromote(candidate.id)}>
                        {promoted ? 'Já é lead' : promoting ? 'Promovendo...' : 'Promover para leads'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Nenhum candidato carregado" description="Escolha um perfil salvo e execute a busca para preencher esta fila de revisão." action={<button type="button" onClick={() => setWorkspaceTab('saved')}>Abrir perfis salvos</button>} />
          )}
        </section>
      ) : null}
    </div>
  );
}
