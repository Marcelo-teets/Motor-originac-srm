import { useState } from 'react';
import { KnowledgeOutcomeIntelligencePanel } from '../components/KnowledgeOutcomeIntelligencePanel';
import { KnowledgeOutcomeOperationsPanel } from '../components/KnowledgeOutcomeOperationsPanel';
import { PageIntro, Pill } from '../components/UI';

export function OutcomeOperationsPage() {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="page outcome-operations-page">
      <PageIntro
        eyebrow="Knowledge Vault / Outcomes"
        title="Outcome Operations"
        description="Fila operacional para transformar ações, tarefas e pipeline em resultados confirmados, mantendo contexto, lineage e governança humana sobre qualquer atividade histórica."
        actions={(
          <div className="pill-row">
            <Pill tone="success">Supabase real</Pill>
            <Pill tone="info">sem outcome sintético</Pill>
            <Pill tone="warning">contexto histórico reconstruído</Pill>
          </div>
        )}
      />

      <KnowledgeOutcomeOperationsPanel
        refreshToken={refreshToken}
        onChanged={() => setRefreshToken((current) => current + 1)}
      />

      <KnowledgeOutcomeIntelligencePanel refreshToken={refreshToken} />
    </div>
  );
}
