import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, DataStatusBanner, ErrorState, LoadingState, PageIntro, Pill, Stat } from './UI';
import { getCompanyDecisionReadiness } from '../lib/companyDecisionReadinessApi';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

export type CompanyDecisionBoundaryScope = 'portfolio' | 'company';

type Props = { children: ReactNode; scope?: CompanyDecisionBoundaryScope };
const integer = new Intl.NumberFormat('pt-BR');

export function CompanyDecisionReadinessBoundary({ children, scope = 'portfolio' }: Props) {
  const { session } = useAuth();
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useAsyncData(() => getCompanyDecisionReadiness(session), [session?.access_token]);

  if (loading) return <LoadingState title="Company Master" subtitle="Validando elegibilidade das entidades antes de carregar scores e pipeline." />;
  if (error || !data) return <ErrorState title="Company Master quality gate" error={error} action={<button type="button" onClick={reload}>Tentar novamente</button>} />;

  const readiness = data.data;
  const allowed = scope === 'company' ? readiness.companyMaster.eligibleCompanyIds.includes(id) : readiness.gateOpen;
  if (allowed) return <>{children}</>;

  const historicalTotal = Object.values(readiness.historicalExcludedRows).reduce((sum, value) => sum + value, 0);
  const title = scope === 'company' ? 'Empresa bloqueada para decisão' : 'Originação real aguardando Company Master';
  const description = scope === 'company'
    ? 'Este registro não está aprovado para qualification, score, ranking, tese ou pipeline. O histórico permanece disponível somente para auditoria técnica.'
    : 'Não há empresas com identidade reconciliada e aprovação explícita para decisão. Seeds demonstrativas e snapshots históricos foram retirados da visão corrente.';

  return (
    <div className="page company-decision-gate-page">
      <PageIntro
        eyebrow="Company Master · Quality Gate"
        title={title}
        description={description}
        actions={<div className="pill-row"><Pill tone="warning">gate fechado</Pill><Pill tone="success">write guards ativos</Pill><Pill tone="info">histórico preservado</Pill></div>}
      />
      <DataStatusBanner source={data.source} note={data.note} />

      <section className="decision-strip">
        <div className="decision-card"><Pill tone="success">Empresas elegíveis</Pill><strong>{readiness.companyMaster.eligibleCompanies}</strong><small>entidades liberadas para decisão real</small></div>
        <div className="decision-card"><Pill tone="warning">Demos bloqueadas</Pill><strong>{readiness.companyMaster.demoCompanies}</strong><small>seeds preservadas apenas para auditoria</small></div>
        <div className="decision-card"><Pill tone="info">Candidatas capturadas</Pill><strong>{readiness.candidateQueue.total}</strong><small>{readiness.candidateQueue.withCnpj} com CNPJ reconciliado</small></div>
        <div className="decision-card"><Pill tone="warning">Histórico excluído</Pill><strong>{integer.format(historicalTotal)}</strong><small>linhas não exibidas como decisão atual</small></div>
      </section>

      <section className="grid cols-2 detail-layout">
        <Card title="Por que a tela foi bloqueada" subtitle="A proteção evita falsos positivos comerciais" tone="accent" className="dense-card">
          <div className="stack-blocks compact-gap">
            <Stat label="Qualifications históricas" value={integer.format(readiness.historicalExcludedRows.qualificationSnapshots)} helper="snapshots ligados a entidades inelegíveis" />
            <Stat label="Lead scores históricos" value={integer.format(readiness.historicalExcludedRows.leadScoreSnapshots)} helper="não entram no ranking corrente" />
            <Stat label="Score snapshots" value={integer.format(readiness.historicalExcludedRows.scoreSnapshots)} helper="preservados para lineage e auditoria" />
            <p className="table-helper">Promoção automática está desativada. Nome semelhante, fundo comparável ou domínio parcial não bastam para criar um lead.</p>
          </div>
        </Card>

        <Card title="Próximas ações" subtitle="Fluxo necessário para reabrir o motor" className="dense-card">
          <ol className="list compact-list">
            {readiness.nextActions.map((action) => (
              <li key={action.code}>
                <div><strong>{action.priority}. {action.label}</strong><div className="table-helper">CNPJ, nome, domínio, lineage e evidência antes da promoção.</div></div>
                <Link to={action.route} className="button secondary">Abrir</Link>
              </li>
            ))}
          </ol>
          <div className="pill-row top-gap">
            <Link to="/capture-inbox" className="button">Revisar candidatas</Link>
            <Link to="/search-profiles" className="button secondary">Ajustar buscas</Link>
            <Link to="/market-map" className="button secondary">Ver comparáveis FIDC</Link>
          </div>
        </Card>
      </section>

      <Card title="Estado das evidências" subtitle="O motor só será reaberto após reconciliação verificável" className="dense-card">
        <div className="mini-metric-grid">
          <Stat label="Candidatas com CNPJ" value={String(readiness.candidateQueue.withCnpj)} helper={`${readiness.candidateQueue.total} candidatas totais`} />
          <Stat label="Registros públicos" value={String(readiness.publicEvidence.records)} helper={`${readiness.publicEvidence.linkedRecords} ligados ao Company Master`} />
          <Stat label="Violações abertas" value={String(readiness.quality.openCompanyViolations)} helper="quality issues de entidade" />
          <Stat label="Write guards" value={readiness.quality.writeGuardsActive ? 'Ativos' : 'Incompletos'} helper="sete camadas de decisão protegidas" />
        </div>
      </Card>
    </div>
  );
}
