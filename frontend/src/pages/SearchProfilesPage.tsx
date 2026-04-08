import { useMemo, useState } from 'react';
import { Card, DataStatusBanner, PageIntro, Pill } from '../components/UI';
import { defaultSearchProfileDraft, searchProfilePresets } from '../mocks/data';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { SearchProfileDraft } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

const profileGroups: Array<{ title: string; fields: Array<{ key: keyof SearchProfileDraft; label: string; options: string[] }> }> = [
  {
    title: 'Segmentação',
    fields: [
      { key: 'segment', label: 'Segmento', options: searchProfilePresets.segments },
      { key: 'subsegment', label: 'Subsetor', options: searchProfilePresets.subsegments },
      { key: 'companyType', label: 'Tipo de empresa', options: searchProfilePresets.companyTypes },
      { key: 'geography', label: 'Geografia', options: searchProfilePresets.geographies },
    ],
  },
  {
    title: 'Estrutura e sinais',
    fields: [
      { key: 'creditProduct', label: 'Produto de crédito', options: searchProfilePresets.creditProducts },
      { key: 'receivables', label: 'Recebíveis', options: searchProfilePresets.receivables },
      { key: 'targetStructure', label: 'Estrutura alvo', options: searchProfilePresets.targetStructures },
      { key: 'signalIntensity', label: 'Intensidade mínima de sinais', options: searchProfilePresets.signalIntensity },
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
  const { data, loading, error, setData } = useAsyncData(() => api.getSearchProfiles(session), [session?.access_token]);

  const summary = useMemo(() => ([
    `Segmento ${draft.segment}`,
    `Subsetor ${draft.subsegment}`,
    `Tipo ${draft.companyType}`,
    `Geografia ${draft.geography}`,
    `Produto ${draft.creditProduct}`,
    `Recebíveis ${draft.receivables}`,
    `Estrutura alvo ${draft.targetStructure}`,
    `Intensidade ${draft.signalIntensity}`,
    `Confidence mínima ${draft.minimumConfidence}`,
    `Janela ${draft.timeWindow}`,
  ]), [draft]);

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
      setSaveMessage(`Perfil salvo com sucesso: ${saved.name}.`);
    } catch (saveError) {
      setSaveMessage(saveError instanceof Error ? saveError.message : 'Falha ao salvar perfil.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page"><Card title="Search Profiles" subtitle="Carregando perfis persistidos">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Search Profiles" subtitle="Falha ao carregar perfis">{error}</Card></div>;

  return (
    <div className="page">
      <PageIntro
        eyebrow="Search Profiles"
        title="Builder executivo de perfis de busca"
        description="A tela continua enxuta, mas agora lê e grava perfis reais no backend protegido por Supabase Auth, preservando a arquitetura já consolidada na main."
        actions={<Pill tone={data.source === 'real' ? 'success' : 'warning'}>{data.source === 'real' ? 'persistência real' : 'persistência parcial'}</Pill>}
      />

      <DataStatusBanner source={data.source} note={data.note} />

      <section className="grid cols-2 search-layout">
        <Card title="Configuração do perfil" subtitle="Filtros agrupados em duas colunas, desktop-first" className="dense-card">
          <div className="profile-groups">
            {profileGroups.map((group) => (
              <div key={group.title} className="profile-group">
                <h4>{group.title}</h4>
                <div className="form-grid two">
                  {group.fields.map((field) => (
                    <label key={field.key}>
                      <span>{field.label}</span>
                      <select value={draft[field.key]} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}>
                        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Resumo do perfil" subtitle="Leitura rápida do perfil configurado + ações principais" tone="accent" className="dense-card">
          <div className="summary-list">
            {summary.map((item) => <div key={item} className="summary-item">{item}</div>)}
          </div>
          {saveMessage ? <p className="table-helper">{saveMessage}</p> : null}
          <div className="actions sticky-actions">
            <button type="button" onClick={() => void handleSave()} disabled={saving}>{saving ? 'Salvando...' : 'Salvar perfil'}</button>
            <button type="button" className="secondary">Rodar busca</button>
          </div>
        </Card>
      </section>

      <Card title="Perfis persistidos" subtitle={`${data.data.length} perfil(is) retornados do backend`} className="dense-card">
        <table className="dense-table">
          <thead>
            <tr><th>Nome</th><th>Segmento</th><th>Estrutura</th><th>Recebíveis</th><th>Status</th></tr>
          </thead>
          <tbody>
            {data.data.map((profile) => (
              <tr key={profile.id}>
                <td><strong>{profile.name}</strong><div className="table-helper">{profile.companyType} · {profile.geography}</div></td>
                <td>{profile.segment} · {profile.subsegment}</td>
                <td>{profile.targetStructure}</td>
                <td>{profile.receivables.join(', ')}</td>
                <td>{profile.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
