import { useMemo, useState } from 'react';
import { Card, DataStatusBanner, PageIntro, Pill } from '../components/UI';
import { defaultSearchProfileDraft, searchProfilePresets } from '../mocks/data';
import type { SearchProfileDraft } from '../lib/types';

const sourceState = { source: 'mock' as const, note: 'Tela de Search Profiles ainda usa configuração local/fallback centralizado, sem endpoint dedicado de persistência.' };

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
  const [draft, setDraft] = useState<SearchProfileDraft>(defaultSearchProfileDraft);
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

  return (
    <div className="page">
      <PageIntro
        eyebrow="Search Profiles"
        title="Builder executivo de perfis de busca"
        description="A tela foi organizada em dois blocos lógicos de filtros, com ações principais visíveis e um resumo imediato do perfil configurado para evitar ambiguidade operacional."
        actions={<Pill tone="warning">persistência ainda parcial</Pill>}
      />

      <DataStatusBanner source={sourceState.source} note={sourceState.note} />

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
          <div className="actions sticky-actions">
            <button type="button">Salvar perfil</button>
            <button type="button" className="secondary">Rodar busca</button>
          </div>
        </Card>
      </section>
    </div>
  );
}
