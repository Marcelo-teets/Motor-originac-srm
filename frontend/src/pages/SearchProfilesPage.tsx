import { useMemo, useState } from 'react';
import { Card, DataStatusBanner, EmptyState, PageIntro, Pill } from '../components/UI';
import { defaultSearchProfileDraft, searchProfilePresets } from '../mocks/data';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { SearchProfileCandidate, SearchProfileDraft } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

const profileSteps: Array<{ number: string; title: string; description: string; fields: Array<{ key: keyof SearchProfileDraft; label: string; options: string[] }> }> = [
  {
    number: '01',
    title: 'Defina o universo',
    description: 'Quem deve entrar no radar.',
    fields: [
      { key: 'segment', label: 'Segmento', options: searchProfilePresets.segments },
      { key: 'subsegment', label: 'Subsetor', options: searchProfilePresets.subsegments },
      { key: 'companyType', label: 'Tipo de empresa', options: searchProfilePresets.companyTypes },
      { key: 'geography', label: 'Geografia', options: searchProfilePresets.geographies },
    ],
  },
  {
    number: '02',
    title: 'Defina a tese financeira',
    description: 'Que necessidade e estrutura queremos detectar.',
    fields: [
      { key: 'creditProduct', label: 'Produto de crédito', options: searchProfilePresets.creditProducts },
      { key: 'receivables', label: 'Recebíveis', options: searchProfilePresets.receivables },
      { key: 'targetStructure', label: 'Estrutura alvo', options: searchProfilePresets.targetStructures },
    ],
  },
  {
    number: '03',
    title: 'Ajuste a qualidade',
    description: 'Evite ruído e priorize sinais recentes.',
    fields: [
      { key: 'signalIntensity', label: 'Intensidade mínima', options: searchProfilePresets.signalIntensity },
      { key: 'minimumConfidence', label: 'Confidence mínima', options: searchProfilePresets.minimumConfidence },
      { key: 'timeWindow', label: 'Janela temporal', options: searchProfilePresets.timeWindows },
    ],
  },
];

export function SearchProfilesPage() {
  const { session } = useAuth();
  const [draft, setDraft] = useState<SearchProfileDraft>(defaultSearchProfileDraft);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [candidates, setCandidates] = useState<SearchProfileCandidate[]>([]);
  const { data, loading, error, setData } = useAsyncData(() => api.getSearchProfiles(session), [session?.access_token]);

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
    setSaving(true);
    setSaveMessage(null);
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
      setSaveMessage(`Perfil salvo: ${saved.name}.`);
    } catch (saveError) {
      setSaveMessage(saveError instanceof Error ? saveError.message : 'Falha ao salvar perfil.');
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    if (!selectedProfileId) {
      setSaveMessage('Selecione um perfil salvo para executar a busca.');
      return;
    }
    setRunning(true);
    setSaveMessage(null);
    try {
      const result = await api.runSearchProfile(session, selectedProfileId);
      setCandidates(result.candidates);
      setSaveMessage(`Busca concluída: ${result.candidates.length} candidato(s) capturado(s).`);
    } catch (runError) {
      setSaveMessage(runError instanceof Error ? runError.message : 'Falha ao rodar busca.');
    } finally {
      setRunning(false);
    }
  };

  const handlePromote = async (candidateId: string) => {
    try {
      await api.promoteSearchCandidate(session, candidateId);
      const refreshed = await api.getSearchProfileCandidates(session, selectedProfileId);
      setCandidates(refreshed);
      setSaveMessage('Candidato promovido para a base de leads.');
    } catch (promoteError) {
      setSaveMessage(promoteError instanceof Error ? promoteError.message : 'Falha ao promover candidato.');
    }
  };

  if (loading) return <div className="page"><Card title="Search Profiles" subtitle="Carregando perfis persistidos">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Search Profiles" subtitle="Falha ao carregar perfis">{error}</Card></div>;

  return (
    <div className="page search-profiles-v3">
      <PageIntro
        eyebrow="Descoberta orientada por tese"
        title="Criar perfil de busca"
        description="Configure o universo, a hipótese financeira e a qualidade mínima dos sinais. Depois salve, execute e promova apenas os candidatos que merecem entrar no ranking."
        actions={<Pill tone={data.source === 'real' ? 'success' : 'warning'}>{data.source === 'real' ? 'persistência real' : 'persistência parcial'}</Pill>}
      />

      <DataStatusBanner source={data.source} note={data.note} />

      <section className="profile-builder-layout">
        <div className="profile-step-list">
          {profileSteps.map((step) => (
            <section key={step.number} className="profile-step-card">
              <div className="profile-step-heading">
                <span>{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </div>
              <div className="form-grid two">
                {step.fields.map((field) => (
                  <label key={field.key}>
                    <span>{field.label}</span>
                    <select value={draft[field.key]} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}>
                      {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="profile-summary-panel">
          <p className="eyebrow">Resumo do perfil</p>
          <h3>{draft.segment} · {draft.targetStructure}</h3>
          <div className="profile-summary-list-v3">
            {summary.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          {saveMessage ? <div className="inline-notice"><span>{saveMessage}</span></div> : null}
          <div className="profile-primary-actions">
            <button type="button" onClick={() => void handleSave()} disabled={saving}>{saving ? 'Salvando...' : 'Salvar novo perfil'}</button>
            <button type="button" className="secondary" onClick={() => void handleRun()} disabled={running || !selectedProfileId}>
              {running ? 'Executando...' : selectedProfile ? `Executar ${selectedProfile.name}` : 'Selecione um perfil abaixo'}
            </button>
          </div>
        </aside>
      </section>

      <Card title="Perfis salvos" subtitle="Selecione um perfil para executar a descoberta" actions={<Pill tone="info">{data.data.length} perfil(is)</Pill>}>
        {data.data.length ? (
          <div className="saved-profile-grid">
            {data.data.map((profile) => {
              const selected = selectedProfileId === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  className={`saved-profile-card ${selected ? 'selected' : ''}`}
                  onClick={() => setSelectedProfileId(profile.id)}
                >
                  <span className="saved-profile-radio" aria-hidden="true" />
                  <span>
                    <strong>{profile.name}</strong>
                    <small>{profile.segment} · {profile.subsegment}</small>
                  </span>
                  <span className="saved-profile-meta">
                    <small>{profile.targetStructure}</small>
                    <small>{profile.status}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Nenhum perfil salvo" description="Configure o primeiro perfil acima e salve para iniciar a descoberta." />
        )}
      </Card>

      <Card title="Candidatos encontrados" subtitle="Revise a evidência antes de promover para a base oficial" actions={<Pill tone={candidates.length ? 'success' : 'info'}>{candidates.length} candidato(s)</Pill>}>
        {candidates.length === 0 ? (
          <EmptyState title="Nenhum candidato carregado" description="Selecione um perfil salvo e execute a busca para preencher esta fila." />
        ) : (
          <div className="candidate-list-v3">
            {candidates.map((candidate) => (
              <article key={candidate.id}>
                <div>
                  <strong>{candidate.companyName}</strong>
                  <span>{candidate.segment} · {candidate.website ?? 'sem site'}</span>
                </div>
                <div>
                  <span className="lead-field-label">Fonte</span>
                  <strong>{candidate.sourceRef}</strong>
                </div>
                <div>
                  <span className="lead-field-label">Confidence</span>
                  <strong>{Math.round(candidate.confidence * 100)}%</strong>
                </div>
                <Pill tone={candidate.status === 'promoted' ? 'success' : 'warning'}>{candidate.status}</Pill>
                <button type="button" className={candidate.status === 'promoted' ? 'secondary compact-button' : 'compact-button'} disabled={candidate.status === 'promoted'} onClick={() => void handlePromote(candidate.id)}>
                  {candidate.status === 'promoted' ? 'Promovido' : 'Promover lead'}
                </button>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
