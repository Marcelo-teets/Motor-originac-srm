import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Pill, Stat } from './UI';
import { useAuth } from '../lib/auth';
import { knowledgeVaultApi } from '../lib/knowledgeVaultApi';
import type { KnowledgeCompanyWorkspace, KnowledgeNodeDetail } from '../lib/knowledgeVaultTypes';
import '../styles/company-knowledge.css';

type CompanyKnowledgePanelProps = {
  companyId: string;
};

const formatDate = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

const normalizeConfidence = (value: number) => (value <= 1 ? value * 100 : value);
const vaultHref = '/knowledge-vault';

export function CompanyKnowledgePanel({ companyId }: CompanyKnowledgePanelProps) {
  const { session } = useAuth();
  const [workspace, setWorkspace] = useState<KnowledgeCompanyWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCaptured, setLastCaptured] = useState<KnowledgeNodeDetail | null>(null);

  const loadWorkspace = useCallback(async () => {
    setError(null);
    const loaded = await knowledgeVaultApi.getCompanyWorkspace(session, companyId);
    setWorkspace(loaded);
  }, [companyId, session]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadWorkspace()
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar a memória da empresa.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [loadWorkspace]);

  const capturedSignals = useMemo(
    () => workspace?.signals.filter((signal) => Boolean(signal.capturedNodeId)).length ?? 0,
    [workspace?.signals],
  );

  const capturedMonitoringOutputs = useMemo(
    () => workspace?.monitoringOutputs.filter((output) => Boolean(output.capturedNodeId)).length ?? 0,
    [workspace?.monitoringOutputs],
  );

  const referenceCount = useMemo(
    () => workspace?.nodes.reduce((sum, node) => sum + (node.referenceCount ?? 0), 0) ?? 0,
    [workspace?.nodes],
  );

  const captureQualification = async () => {
    setBusyAction('qualification');
    setNotice(null);
    setError(null);
    try {
      const captured = await knowledgeVaultApi.captureQualificationNote(session, companyId);
      setLastCaptured(captured);
      setNotice('Tese criada a partir do snapshot de qualificação e vinculada à evidência original.');
      await loadWorkspace();
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'Falha ao transformar a qualificação em tese.');
    } finally {
      setBusyAction(null);
    }
  };

  const captureSignal = async (signalId: string) => {
    setBusyAction(`signal:${signalId}`);
    setNotice(null);
    setError(null);
    try {
      const captured = await knowledgeVaultApi.captureSignalNote(session, signalId);
      setLastCaptured(captured);
      setNotice('Sinal convertido em nota auditável com o snapshot da evidência.');
      await loadWorkspace();
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'Falha ao capturar o sinal no Vault.');
    } finally {
      setBusyAction(null);
    }
  };

  const captureMonitoringOutput = async (monitoringOutputId: string) => {
    setBusyAction(`monitoring:${monitoringOutputId}`);
    setNotice(null);
    setError(null);
    try {
      const captured = await knowledgeVaultApi.captureMonitoringOutputNote(session, monitoringOutputId);
      setLastCaptured(captured);
      setNotice('Output preservado como observação auditável. Nenhum sinal ou score foi alterado automaticamente.');
      await loadWorkspace();
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'Falha ao capturar o output de monitoramento no Vault.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <Card
      title="Knowledge Vault / Memória da empresa"
      subtitle="Teses, sinais, outputs e evidências rastreáveis conectados ao Company Master"
      className="dense-card company-knowledge-card"
      tone="accent"
    >
      <div className="company-knowledge-actions">
        <div className="pill-row">
          <Pill tone="info">{workspace?.nodes.length ?? 0} notas</Pill>
          <Pill tone="success">{referenceCount} evidências</Pill>
          <Pill tone="default">{capturedMonitoringOutputs}/{workspace?.monitoringOutputs.length ?? 0} outputs preservados</Pill>
          <Pill tone="warning">{capturedSignals}/{workspace?.signals.length ?? 0} sinais capturados</Pill>
        </div>
        <div className="actions">
          <Link className="button secondary" to={vaultHref}>Abrir Vault</Link>
          <Link className="button" to={vaultHref}>Nova nota</Link>
        </div>
      </div>

      {loading ? <p className="table-helper">Carregando memória, outputs, sinais e qualificação reais...</p> : null}
      {error ? <div className="data-banner data-banner-warning"><Pill tone="danger">erro</Pill><span>{error}</span></div> : null}
      {notice ? (
        <div className="data-banner data-banner-success">
          <Pill tone="success">ok</Pill>
          <span>{notice}</span>
          {lastCaptured ? <Link to={vaultHref}>Abrir Vault</Link> : null}
        </div>
      ) : null}

      {!loading && workspace ? (
        <div className="company-knowledge-layout">
          <section className="company-knowledge-section">
            <div className="row-between company-knowledge-section-head">
              <div>
                <span className="section-label">Tese viva</span>
                <h4>Snapshot de qualificação</h4>
              </div>
              <button
                type="button"
                className="compact-button"
                disabled={!workspace.latestQualification || busyAction === 'qualification'}
                onClick={() => void captureQualification()}
              >
                {busyAction === 'qualification' ? 'Gerando...' : 'Gerar / abrir tese'}
              </button>
            </div>

            {workspace.latestQualification ? (
              <>
                <div className="mini-metric-grid company-knowledge-metrics">
                  <Stat label="Qualification" value={String(Math.round(workspace.latestQualification.totalScore ?? 0))} helper="score estrutural atual" />
                  <Stat label="Funding need" value={String(Math.round(workspace.latestQualification.fundingNeedScore ?? 0))} helper="pressão de capital prevista" />
                  <Stat label="Urgência" value={String(Math.round(workspace.latestQualification.urgencyScore ?? 0))} helper="janela de abordagem" />
                  <Stat label="Estrutura" value={workspace.latestQualification.suggestedStructure ?? 'Em avaliação'} helper="recomendação atual" />
                </div>
                <div className="company-knowledge-thesis-copy">
                  <p>{workspace.latestQualification.capitalStructureRationale || 'Rationale ainda não consolidado.'}</p>
                  <div className="pill-row">
                    <Pill tone={workspace.latestQualification.fitFidc ? 'success' : 'default'}>FIDC {workspace.latestQualification.fitFidc ? 'fit' : 'em avaliação'}</Pill>
                    <Pill tone={workspace.latestQualification.fitDcm ? 'success' : 'default'}>DCM {workspace.latestQualification.fitDcm ? 'fit' : 'em avaliação'}</Pill>
                    {workspace.latestQualification.fundingGapLevel ? <Pill tone="warning">gap {workspace.latestQualification.fundingGapLevel}</Pill> : null}
                  </div>
                  <small>Próxima ação: {workspace.latestQualification.nextAction || workspace.pipeline?.nextAction || 'Validar evidências e definir abordagem.'}</small>
                </div>
              </>
            ) : (
              <EmptyState title="Sem snapshot de qualificação real." description="Recalcule a empresa antes de gerar uma tese auditável no Vault." />
            )}
          </section>

          <section className="company-knowledge-section">
            <div className="company-knowledge-section-head">
              <span className="section-label">Memória institucional</span>
              <h4>Notas mais recentes</h4>
            </div>
            {workspace.nodes.length ? (
              <div className="company-knowledge-notes">
                {workspace.nodes.slice(0, 6).map((node) => (
                  <Link key={node.id} to={vaultHref} className="company-knowledge-note" title="Abrir no Knowledge Vault">
                    <div>
                      <strong>{node.title}</strong>
                      <span>{node.nodeType} · {node.referenceCount ?? 0} evidências · {node.backlinkCount} backlinks</span>
                    </div>
                    <small>{formatDate(node.updatedAt)}</small>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title={`Ainda não há memória consolidada para ${workspace.company.name}.`} description="Gere a tese, preserve um output, capture um sinal ou crie uma nota manual vinculada à empresa." />
            )}
          </section>

          <section className="company-knowledge-section company-knowledge-monitoring">
            <div className="company-knowledge-section-head">
              <div>
                <span className="section-label">Outputs monitorados</span>
                <h4>Preservar observação antes de interpretar</h4>
              </div>
              <Pill tone="default">não altera score</Pill>
            </div>
            {workspace.monitoringOutputs.length ? (
              <div className="company-monitoring-list">
                {workspace.monitoringOutputs.map((output) => (
                  <article key={output.id} className="company-monitoring-row">
                    <div className="company-monitoring-copy">
                      <div className="row-between">
                        <strong>{output.title || output.sourceName || output.outputType.replace(/_/g, ' ')}</strong>
                        <div className="pill-row">
                          <Pill tone={output.connectorStatus === 'real' || output.connectorStatus === 'healthy' ? 'success' : 'warning'}>{output.connectorStatus}</Pill>
                          <Pill tone="default">{Math.round(normalizeConfidence(output.confidenceScore ?? 0))}% confiança</Pill>
                        </div>
                      </div>
                      <p>{output.summary || 'Sem resumo textual. A observação deve ser validada na fonte primária antes de qualquer inferência.'}</p>
                      <small>
                        {output.sourceName || 'fonte não identificada'} · {output.observedVsInferred} · {output.status} · {formatDate(output.observedAt)}
                        {output.url ? <> · <a href={output.url} target="_blank" rel="noreferrer">abrir fonte</a></> : null}
                      </small>
                    </div>
                    {output.capturedNodeId ? (
                      <Link className="button secondary compact-button" to={vaultHref}>Abrir Vault</Link>
                    ) : (
                      <button
                        type="button"
                        className="secondary compact-button"
                        disabled={busyAction === `monitoring:${output.id}`}
                        onClick={() => void captureMonitoringOutput(output.id)}
                      >
                        {busyAction === `monitoring:${output.id}` ? 'Preservando...' : 'Preservar output'}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="Sem outputs de monitoramento disponíveis." description="Execute os conectores da empresa para alimentar observações rastreáveis antes da camada de sinais." />
            )}
          </section>

          <section className="company-knowledge-section company-knowledge-signals">
            <div className="company-knowledge-section-head">
              <span className="section-label">Sinais reais</span>
              <h4>Converter evidência validada em conhecimento</h4>
            </div>
            {workspace.signals.length ? (
              <div className="company-signal-list">
                {workspace.signals.slice(0, 6).map((signal) => (
                  <article key={signal.id} className="company-signal-row">
                    <div className="company-signal-copy">
                      <div className="row-between">
                        <strong>{signal.label}</strong>
                        <div className="pill-row">
                          <Pill tone={signal.strength >= 80 ? 'warning' : 'info'}>{Math.round(signal.strength)} força</Pill>
                          <Pill tone="default">{Math.round(normalizeConfidence(signal.confidence))}% confiança</Pill>
                        </div>
                      </div>
                      <p>{signal.evidenceText || signal.type.replace(/_/g, ' ')}</p>
                      <small>{signal.isExplicit ? 'explícito' : 'inferido'} · {formatDate(signal.observedAt)}</small>
                    </div>
                    {signal.capturedNodeId ? (
                      <Link className="button secondary compact-button" to={vaultHref}>Abrir Vault</Link>
                    ) : (
                      <button
                        type="button"
                        className="secondary compact-button"
                        disabled={busyAction === `signal:${signal.id}`}
                        onClick={() => void captureSignal(signal.id)}
                      >
                        {busyAction === `signal:${signal.id}` ? 'Capturando...' : 'Capturar sinal'}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="Sem sinais reais disponíveis." description="Preserve e valide os outputs monitorados; sinais tratados aparecerão aqui para captura." />
            )}
          </section>
        </div>
      ) : null}
    </Card>
  );
}
